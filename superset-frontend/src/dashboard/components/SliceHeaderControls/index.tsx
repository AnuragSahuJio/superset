/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import React, {
  MouseEvent,
  Key,
  ReactChild,
  useState,
  useRef,
  RefObject,
  useCallback,
} from 'react';
import { RouteComponentProps, useHistory, withRouter } from 'react-router-dom';
import moment from 'moment';
import {
  Behavior,
  css,
  isFeatureEnabled,
  FeatureFlag,
  getChartMetadataRegistry,
  QueryFormData,
  styled,
  t,
  useTheme,
} from '@superset-ui/core';
import { useSelector } from 'react-redux';
import { Menu } from 'src/components/Menu';
import { NoAnimationDropdown } from 'src/components/Dropdown';
import ShareMenuItems from 'src/dashboard/components/menu/ShareMenuItems';
import downloadAsImage from 'src/utils/downloadAsImage';
import { getSliceHeaderTooltip } from 'src/dashboard/util/getSliceHeaderTooltip';
import { Tooltip } from 'src/components/Tooltip';
import Icons from 'src/components/Icons';
import ModalTrigger from 'src/components/ModalTrigger';
import Button from 'src/components/Button';
import ViewQueryModal from 'src/explore/components/controls/ViewQueryModal';
import { ResultsPaneOnDashboard } from 'src/explore/components/DataTablesPane';
import Modal from 'src/components/Modal';
import { DrillDetailMenuItems } from 'src/components/Chart/DrillDetail';
import { LOG_ACTIONS_CHART_DOWNLOAD_AS_IMAGE } from 'src/logger/LogUtils';
import { RootState } from 'src/dashboard/types';
import { findPermission } from 'src/utils/findPermission';
import { useCrossFiltersScopingModal } from '../nativeFilters/FilterBar/CrossFilters/ScopingModal/useCrossFiltersScopingModal';

const MENU_KEYS = {
  DOWNLOAD_AS_IMAGE: 'download_as_image',
  EXPLORE_CHART: 'explore_chart',
  EXPORT_CSV: 'export_csv',
  EXPORT_FULL_CSV: 'export_full_csv',
  EXPORT_XLSX: 'export_xlsx',
  EXPORT_FULL_XLSX: 'export_full_xlsx',
  FORCE_REFRESH: 'force_refresh',
  FULLSCREEN: 'fullscreen',
  TOGGLE_CHART_DESCRIPTION: 'toggle_chart_description',
  VIEW_QUERY: 'view_query',
  VIEW_RESULTS: 'view_results',
  DRILL_TO_DETAIL: 'drill_to_detail',
  CROSS_FILTER_SCOPING: 'cross_filter_scoping',
  SHARE: 'share',
  DOWNLOAD: 'download',
};

const ACTION_KEYS = {
  enter: 'Enter',
  spacebar: 'Spacebar',
  space: ' ',
};

const NAV_KEYS = {
  tab: 'Tab',
  escape: 'Escape',
  up: 'ArrowUp',
  down: 'ArrowDown',
};

// TODO: replace 3 dots with an icon
const VerticalDotsContainer = styled.div`
  padding: ${({ theme }) => theme.gridUnit / 4}px
    ${({ theme }) => theme.gridUnit * 1.5}px;

  .dot {
    display: block;

    height: ${({ theme }) => theme.gridUnit}px;
    width: ${({ theme }) => theme.gridUnit}px;
    border-radius: 50%;
    margin: ${({ theme }) => theme.gridUnit / 2}px 0;

    background-color: ${({ theme }) => theme.colors.text.label};
  }

  &:hover {
    cursor: pointer;
  }
`;

const RefreshTooltip = styled.div`
  height: auto;
  margin: ${({ theme }) => theme.gridUnit}px 0;
  color: ${({ theme }) => theme.colors.grayscale.base};
  line-height: 21px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
`;

const getScreenshotNodeSelector = (chartId: string | number) =>
  `.dashboard-chart-id-${chartId}`;

const VerticalDotsTrigger = () => (
  <VerticalDotsContainer>
    <span className="dot" />
    <span className="dot" />
    <span className="dot" />
  </VerticalDotsContainer>
);

export interface SliceHeaderControlsProps {
  slice: {
    description: string;
    viz_type: string;
    slice_name: string;
    slice_id: number;
    slice_description: string;
    datasource: string;
  };

  componentId: string;
  dashboardId: number;
  chartStatus: string;
  isCached: boolean[];
  cachedDttm: string[] | null;
  isExpanded?: boolean;
  updatedDttm: number | null;
  isFullSize?: boolean;
  isDescriptionExpanded?: boolean;
  formData: QueryFormData;
  exploreUrl: string;

  forceRefresh: (sliceId: number, dashboardId: number) => void;
  logExploreChart?: (sliceId: number) => void;
  logEvent?: (eventName: string, eventData?: object) => void;
  toggleExpandSlice?: (sliceId: number) => void;
  exportCSV?: (sliceId: number) => void;
  exportFullCSV?: (sliceId: number) => void;
  exportXLSX?: (sliceId: number) => void;
  exportFullXLSX?: (sliceId: number) => void;
  handleToggleFullSize: () => void;

  addDangerToast: (message: string) => void;
  addSuccessToast: (message: string) => void;

  supersetCanExplore?: boolean;
  supersetCanShare?: boolean;
  supersetCanCSV?: boolean;

  crossFiltersEnabled?: boolean;
}
type SliceHeaderControlsPropsWithRouter = SliceHeaderControlsProps &
  RouteComponentProps;

const dropdownIconsStyles = css`
  &&.anticon > .anticon:first-child {
    margin-right: 0;
    vertical-align: 0;
  }
`;

export const handleDropdownNavigation = (
  e: React.KeyboardEvent<HTMLElement>,
  dropdownIsOpen: boolean,
  menu: React.ReactElement,
  toggleDropdown: () => void,
  setSelectedKeys: (keys: string[]) => void,
) => {
  if (e.key === NAV_KEYS.tab && !dropdownIsOpen) {
    return; // if tab, continue with system tab navigation
  }
  const menuProps = menu.props || {};
  // for accessibility using keyboard navigation
  const keys = (
    Array.isArray(menuProps.children)
      ? menuProps.children
      : [menuProps.children]
  )
    .map(
      (item: any) =>
        item?.key ||
        item?.props?.children?.find((child: React.ReactElement) => child?.key)
          ?.key,
    )
    .filter((item: any) => !!item);
  const { selectedKeys = [] } = menuProps;
  const currentKeyIndex = keys.indexOf(selectedKeys[0]);

  switch (e.key) {
    // toggle the dropdown on keypress
    case ACTION_KEYS.enter:
    case ACTION_KEYS.spacebar:
    case ACTION_KEYS.space:
      if (selectedKeys.length) {
        // when a menu item is selected, then trigger
        // the menu item's onClick handler
        menuProps.onClick?.({ key: selectedKeys[0], domEvent: e });
        // clear out/deselect keys
        setSelectedKeys([]);
        // put focus back on menu trigger
        e.currentTarget.focus();
      }
      // if nothing was selected, or after selecting new menu item,
      toggleDropdown();
      break;
    // select the menu items going down
    case NAV_KEYS.down:
    case NAV_KEYS.tab && !e.shiftKey:
      setSelectedKeys([keys[Math.min(currentKeyIndex + 1, keys.length)]]);
      break;
    // select the menu items going up
    case NAV_KEYS.up:
    case NAV_KEYS.tab && e.shiftKey:
      setSelectedKeys([keys[Math.max(currentKeyIndex - 1, 0)]]);
      break;
    case NAV_KEYS.escape:
      // close dropdown menu
      toggleDropdown();
      break;
    default:
      break;
  }
};

const ViewResultsModalTrigger = ({
  canExplore,
  exploreUrl,
  triggerNode,
  modalTitle,
  modalBody,
  showModal = false,
  setShowModal,
}: {
  canExplore?: boolean;
  exploreUrl: string;
  triggerNode: ReactChild;
  modalTitle: ReactChild;
  modalBody: ReactChild;
  showModal: boolean;
  setShowModal: (showModal: boolean) => void;
}) => {
  const history = useHistory();
  const exploreChart = () => history.push(exploreUrl);
  const theme = useTheme();
  const openModal = useCallback(() => setShowModal(true), []);
  const closeModal = useCallback(() => setShowModal(false), []);

  return (
    <>
      <span
        data-test="span-modal-trigger"
        onClick={openModal}
        role="button"
        tabIndex={0}
      >
        {triggerNode}
      </span>
      {(() => (
        <Modal
          css={css`
            .ant-modal-body {
              display: flex;
              flex-direction: column;
            }
          `}
          show={showModal}
          onHide={closeModal}
          closable
          title={modalTitle}
          footer={
            <>
              <Button
                buttonStyle="secondary"
                buttonSize="small"
                onClick={exploreChart}
                disabled={!canExplore}
                tooltip={
                  !canExplore
                    ? t(
                        'You do not have sufficient permissions to edit the chart',
                      )
                    : undefined
                }
              >
                {t('Edit chart')}
              </Button>
              <Button
                buttonStyle="primary"
                buttonSize="small"
                onClick={closeModal}
                css={css`
                  margin-left: ${theme.gridUnit * 2}px;
                `}
              >
                {t('Close')}
              </Button>
            </>
          }
          responsive
          resizable
          resizableConfig={{
            minHeight: theme.gridUnit * 128,
            minWidth: theme.gridUnit * 128,
            defaultSize: {
              width: 'auto',
              height: '75vh',
            },
          }}
          draggable
          destroyOnClose
        >
          {modalBody}
        </Modal>
      ))()}
    </>
  );
};

const SliceHeaderControls = (props: SliceHeaderControlsPropsWithRouter) => {
  const [dropdownIsOpen, setDropdownIsOpen] = useState(false);
  const [tableModalIsOpen, setTableModalIsOpen] = useState(false);
  const [drillModalIsOpen, setDrillModalIsOpen] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [openScopingModal, scopingModal] = useCrossFiltersScopingModal(
    props.slice.slice_id,
  );

  const queryMenuRef: RefObject<any> = useRef(null);
  const menuRef: RefObject<any> = useRef(null);

  const toggleDropdown = ({ close }: { close?: boolean } = {}) => {
    setDropdownIsOpen(!(close || dropdownIsOpen));
    // clear selected keys
    setSelectedKeys([]);
  };

  const canEditCrossFilters =
    useSelector<RootState, boolean>(
      ({ dashboardInfo }) => dashboardInfo.dash_edit_perm,
    ) &&
    isFeatureEnabled(FeatureFlag.DashboardCrossFilters) &&
    getChartMetadataRegistry()
      .get(props.slice.viz_type)
      ?.behaviors?.includes(Behavior.InteractiveChart);
  const canExplore = props.supersetCanExplore;
  const canDatasourceSamples = useSelector((state: RootState) =>
    findPermission('can_samples', 'Datasource', state.user?.roles),
  );
  const canDrillToDetail = canExplore && canDatasourceSamples;
  const canViewQuery = useSelector((state: RootState) =>
    findPermission('can_view_query', 'Dashboard', state.user?.roles),
  );
  const canViewTable = useSelector((state: RootState) =>
    findPermission('can_view_chart_as_table', 'Dashboard', state.user?.roles),
  );
  const refreshChart = () => {
    if (props.updatedDttm) {
      props.forceRefresh(props.slice.slice_id, props.dashboardId);
    }
  };

  const handleMenuClick = ({
    key,
    domEvent,
  }: {
    key: Key;
    domEvent: MouseEvent<HTMLElement>;
  }) => {
    // close menu
    toggleDropdown({ close: true });
    switch (key) {
      case MENU_KEYS.FORCE_REFRESH:
        refreshChart();
        props.addSuccessToast(t('Data refreshed'));
        break;
      case MENU_KEYS.TOGGLE_CHART_DESCRIPTION:
        // eslint-disable-next-line no-unused-expressions
        props.toggleExpandSlice?.(props.slice.slice_id);
        break;
      case MENU_KEYS.EXPLORE_CHART:
        // eslint-disable-next-line no-unused-expressions
        props.logExploreChart?.(props.slice.slice_id);
        window.open(props.exploreUrl);
        break;
      case MENU_KEYS.EXPORT_CSV:
        // eslint-disable-next-line no-unused-expressions
        props.exportCSV?.(props.slice.slice_id);
        break;
      case MENU_KEYS.FULLSCREEN:
        props.handleToggleFullSize();
        break;
      case MENU_KEYS.EXPORT_FULL_CSV:
        // eslint-disable-next-line no-unused-expressions
        props.exportFullCSV?.(props.slice.slice_id);
        break;
      case MENU_KEYS.EXPORT_FULL_XLSX:
        // eslint-disable-next-line no-unused-expressions
        props.exportFullXLSX?.(props.slice.slice_id);
        break;
      case MENU_KEYS.EXPORT_XLSX:
        // eslint-disable-next-line no-unused-expressions
        props.exportXLSX?.(props.slice.slice_id);
        break;
      case MENU_KEYS.DOWNLOAD_AS_IMAGE: {
        // menu closes with a delay, we need to hide it manually,
        // so that we don't capture it on the screenshot
        const menu = document.querySelector(
          '.ant-dropdown:not(.ant-dropdown-hidden)',
        ) as HTMLElement;
        menu.style.visibility = 'hidden';
        downloadAsImage(
          getScreenshotNodeSelector(props.slice.slice_id),
          props.slice.slice_name,
          true,
          // @ts-ignore
        )(domEvent).then(() => {
          menu.style.visibility = 'visible';
        });
        props.logEvent?.(LOG_ACTIONS_CHART_DOWNLOAD_AS_IMAGE, {
          chartId: props.slice.slice_id,
        });
        break;
      }
      case MENU_KEYS.CROSS_FILTER_SCOPING: {
        openScopingModal();
        break;
      }
      case MENU_KEYS.VIEW_RESULTS: {
        if (!tableModalIsOpen) {
          setTableModalIsOpen(true);
        }
        break;
      }
      case MENU_KEYS.DRILL_TO_DETAIL: {
        setDrillModalIsOpen(!drillModalIsOpen);
        break;
      }
      case MENU_KEYS.VIEW_QUERY: {
        if (queryMenuRef.current && !queryMenuRef.current.showModal) {
          queryMenuRef.current.open(domEvent);
        }
        break;
      }
      default:
        break;
    }
  };

  const {
    componentId,
    dashboardId,
    slice,
    isFullSize,
    cachedDttm = [],
    updatedDttm = null,
    addSuccessToast = () => {},
    addDangerToast = () => {},
    supersetCanShare = false,
    isCached = [],
  } = props;
  const isTable = slice.viz_type === 'table';
  const cachedWhen = (cachedDttm || []).map(itemCachedDttm =>
    moment.utc(itemCachedDttm).fromNow(),
  );
  const updatedWhen = updatedDttm ? moment.utc(updatedDttm).fromNow() : '';
  const getCachedTitle = (itemCached: boolean) => {
    if (itemCached) {
      return t('Cached %s', cachedWhen);
    }
    if (updatedWhen) {
      return t('Fetched %s', updatedWhen);
    }
    return '';
  };
  const refreshTooltipData = [...new Set(isCached.map(getCachedTitle) || '')];
  // If all queries have same cache time we can unit them to one
  const refreshTooltip = refreshTooltipData.map((item, index) => (
    <div key={`tooltip-${index}`}>
      {refreshTooltipData.length > 1
        ? t('Query %s: %s', index + 1, item)
        : item}
    </div>
  ));
  const fullscreenLabel = isFullSize
    ? t('Exit fullscreen')
    : t('Enter fullscreen');

  // @z-index-below-dashboard-header (100) - 1 = 99 for !isFullSize and 101 for isFullSize
  const dropdownOverlayStyle = {
    zIndex: isFullSize ? 101 : 99,
    animationDuration: '0s',
  };

  const menu = (
    <Menu
      onClick={handleMenuClick}
      selectable={false}
      data-test={`slice_${slice.slice_id}-menu`}
      selectedKeys={selectedKeys}
      id={`slice_${slice.slice_id}-menu`}
      ref={menuRef}
    >
      <Menu.Item
        key={MENU_KEYS.FORCE_REFRESH}
        disabled={props.chartStatus === 'loading'}
        style={{ height: 'auto', lineHeight: 'initial' }}
        data-test="refresh-chart-menu-item"
      >
        {t('Force refresh')}
        <RefreshTooltip data-test="dashboard-slice-refresh-tooltip">
          {refreshTooltip}
        </RefreshTooltip>
      </Menu.Item>

      <Menu.Item key={MENU_KEYS.FULLSCREEN}>{fullscreenLabel}</Menu.Item>

      <Menu.Divider />

      {slice.description && (
        <Menu.Item key={MENU_KEYS.TOGGLE_CHART_DESCRIPTION}>
          {props.isDescriptionExpanded
            ? t('Hide chart description')
            : t('Show chart description')}
        </Menu.Item>
      )}

      {canExplore && (
        <Menu.Item key={MENU_KEYS.EXPLORE_CHART}>
          <Tooltip title={getSliceHeaderTooltip(props.slice.slice_name)}>
            {t('Edit chart')}
          </Tooltip>
        </Menu.Item>
      )}

      {canEditCrossFilters && (
        <>
          <Menu.Item key={MENU_KEYS.CROSS_FILTER_SCOPING}>
            {t('Cross-filtering scoping')}
          </Menu.Item>
          <Menu.Divider />
        </>
      )}

      {(canExplore || canViewQuery) && (
        <Menu.Item key={MENU_KEYS.VIEW_QUERY}>
          <ModalTrigger
            triggerNode={
              <span data-test="view-query-menu-item">{t('View query')}</span>
            }
            modalTitle={t('View query')}
            modalBody={<ViewQueryModal latestQueryFormData={props.formData} />}
            draggable
            resizable
            responsive
            ref={queryMenuRef}
          />
        </Menu.Item>
      )}

      {(canExplore || canViewTable) && (
        <Menu.Item key={MENU_KEYS.VIEW_RESULTS}>
          <ViewResultsModalTrigger
            canExplore={props.supersetCanExplore}
            exploreUrl={props.exploreUrl}
            triggerNode={
              <span data-test="view-query-menu-item">{t('View as table')}</span>
            }
            setShowModal={setTableModalIsOpen}
            showModal={tableModalIsOpen}
            modalTitle={t('Chart Data: %s', slice.slice_name)}
            modalBody={
              <ResultsPaneOnDashboard
                queryFormData={props.formData}
                queryForce={false}
                dataSize={20}
                isRequest
                isVisible
              />
            }
          />
        </Menu.Item>
      )}

      {isFeatureEnabled(FeatureFlag.DrillToDetail) && canDrillToDetail && (
        <DrillDetailMenuItems
          chartId={slice.slice_id}
          formData={props.formData}
          key={MENU_KEYS.DRILL_TO_DETAIL}
          showModal={drillModalIsOpen}
          setShowModal={setDrillModalIsOpen}
        />
      )}

      {(slice.description || canExplore) && <Menu.Divider />}

      {supersetCanShare && (
        <Menu.SubMenu title={t('Share')} key={MENU_KEYS.SHARE}>
          <ShareMenuItems
            dashboardId={dashboardId}
            dashboardComponentId={componentId}
            copyMenuItemTitle={t('Copy permalink to clipboard')}
            emailMenuItemTitle={t('Share chart by email')}
            emailSubject={t('Superset chart')}
            emailBody={t('Check out this chart: ')}
            addSuccessToast={addSuccessToast}
            addDangerToast={addDangerToast}
          />
        </Menu.SubMenu>
      )}

      {props.supersetCanCSV && (
        <Menu.SubMenu title={t('Download')} key={MENU_KEYS.DOWNLOAD}>
          <Menu.Item
            key={MENU_KEYS.EXPORT_CSV}
            icon={<Icons.FileOutlined css={dropdownIconsStyles} />}
          >
            {t('Export to .CSV')}
          </Menu.Item>
          <Menu.Item
            key={MENU_KEYS.EXPORT_XLSX}
            icon={<Icons.FileOutlined css={dropdownIconsStyles} />}
          >
            {t('Export to Excel')}
          </Menu.Item>

          {isFeatureEnabled(FeatureFlag.AllowFullCsvExport) &&
            props.supersetCanCSV &&
            isTable && (
              <>
                <Menu.Item
                  key={MENU_KEYS.EXPORT_FULL_CSV}
                  icon={<Icons.FileOutlined css={dropdownIconsStyles} />}
                >
                  {t('Export to full .CSV')}
                </Menu.Item>
                <Menu.Item
                  key={MENU_KEYS.EXPORT_FULL_XLSX}
                  icon={<Icons.FileOutlined css={dropdownIconsStyles} />}
                >
                  {t('Export to full Excel')}
                </Menu.Item>
              </>
            )}

          <Menu.Item
            key={MENU_KEYS.DOWNLOAD_AS_IMAGE}
            icon={<Icons.FileImageOutlined css={dropdownIconsStyles} />}
          >
            {t('Download as image')}
          </Menu.Item>
        </Menu.SubMenu>
      )}
    </Menu>
  );

  return (
    <>
      {isFullSize && (
        <Icons.FullscreenExitOutlined
          style={{ fontSize: 22 }}
          onClick={() => {
            props.handleToggleFullSize();
          }}
        />
      )}
      <NoAnimationDropdown
        overlay={menu}
        overlayStyle={dropdownOverlayStyle}
        trigger={['click']}
        placement="bottomRight"
        visible={dropdownIsOpen}
        onVisibleChange={status => toggleDropdown({ close: !status })}
        onBlur={e => {
          // close unless the dropdown menu is clicked
          const relatedTarget = e.relatedTarget as HTMLElement;
          if (
            dropdownIsOpen &&
            menuRef?.current?.props.id !== relatedTarget?.id
          ) {
            toggleDropdown({ close: true });
          }
        }}
        onKeyDown={e =>
          handleDropdownNavigation(
            e,
            dropdownIsOpen,
            menu,
            toggleDropdown,
            setSelectedKeys,
          )
        }
      >
        <span
          css={() => css`
            display: flex;
            align-items: center;
          `}
          id={`slice_${slice.slice_id}-controls`}
          role="button"
          aria-label="More Options"
          tabIndex={0}
        >
          <VerticalDotsTrigger />
        </span>
      </NoAnimationDropdown>
      {canEditCrossFilters && scopingModal}
    </>
  );
};

export default withRouter(SliceHeaderControls);
